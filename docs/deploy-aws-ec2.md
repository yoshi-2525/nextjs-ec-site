# samurai-store を AWS EC2 にデプロイする手順

Heroku 版の教材（29章）と同じ要件を、EC2 1台で満たすための手順です。

## 0. 構成と要件の対応

| 教材（Heroku）の要件 | EC2 での対応 |
| --- | --- |
| Heroku アプリ（Node.js 実行環境） | EC2（Ubuntu 24.04）＋ Node.js（nvm）＋ PM2 |
| `https://アプリ名.herokuapp.com` | Elastic IP ＋ `sslip.io` ドメイン ＋ Nginx ＋ Let's Encrypt（HTTPS） |
| JawsDB（MySQL/MariaDB） | 同じ EC2 に MariaDB をインストール |
| `heroku config:set`（環境変数） | サーバー上の `.env.production` |
| `git push heroku main` | GitHub から `git pull` → `npm run build` → `pm2 restart` |
| MySQL Workbench でインポート | `scp` で .sql を転送 → `mysql` コマンドでインポート |
| Stripe Webhook | `https://<ドメイン>/api/orders/webhook` を登録 |
| （Heroku では不可）アップロード画像の保存 | EC2 のディスクは永続なので保存・表示できる（Nginx で直接配信） |

```
ブラウザ / Stripe
     │ HTTPS(443)
     ▼
┌──────────── EC2 (Ubuntu 24.04) ────────────┐
│ Nginx ──(/uploads/*)──▶ public/uploads 直接配信 │
│   │                                          │
│   └─(それ以外)──▶ Next.js (PM2, :3000)        │
│                       │                      │
│                       ▼                      │
│                MariaDB (:3306, 外部非公開)     │
└──────────────────────────────────────────────┘
```

以降、`<EIP>` は Elastic IP（例 `54.12.34.56`）、`<DOMAIN>` は `54-12-34-56.sslip.io` のように IP のドットをハイフンにしたもの、`<KEY>.pem` はキーペアのファイルを指します。

> 独自ドメインを持っている場合は、`<DOMAIN>` を独自ドメインに置き換え、DNS の A レコードを `<EIP>` に向けてください。

---

## 1. ローカルでコードを修正し GitHub に push する

### 1-1. 決済後のリダイレクト先を環境変数にする（教材の手順1と同じ）

[src/app/api/orders/checkout/route.ts](../src/app/api/orders/checkout/route.ts) を編集します。

```ts
// 決済成功時のリダイレクト先
success_url: `${process.env.BASE_URL}/account?session_id={CHECKOUT_SESSION_ID}`,
// 決済キャンセル時のリダイレクト先
cancel_url: `${process.env.BASE_URL}/order-confirm`,
```

### 1-2. push

```bash
git add .
git commit -m "決済のリダイレクト先をBASE_URLに変更"
git push origin main
```

`.env*` は `.gitignore` 済みなので、秘密情報は GitHub に上がりません（上がっていないことを GitHub 上で確認しておくと安心です）。

### 1-3. ローカル DB をエクスポートする（教材の「エクスポートしよう」と同じ）

phpMyAdmin →「エクスポート」→「詳細」→ `nextjs_samuraistore` を選択 → エクスポート。
出力された `.sql` ファイルに以下の2行があれば削除して保存します。

```sql
CREATE DATABASE IF NOT EXISTS `nextjs_samuraistore` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `nextjs_samuraistore`;
```

ファイル名は `samurai.sql` にリネームしておくと以降の手順が楽です。

---

## 2. AWS 上に EC2 を作成する

### 2-1. インスタンスを起動

AWS マネジメントコンソール → リージョンを「アジアパシフィック（東京）ap-northeast-1」に → EC2 →「インスタンスを起動」。

| 項目 | 設定値 |
| --- | --- |
| 名前 | `samurai-store` |
| AMI | Ubuntu Server 24.04 LTS（64-bit x86） |
| インスタンスタイプ | `t3.micro`（無料枠対象。メモリ 1GB のため手順 3-2 でスワップを追加） |
| キーペア | 「新しいキーペアを作成」→ RSA / `.pem` → ダウンロードして安全な場所に保存 |
| ネットワーク設定 → セキュリティグループ | 新規作成。下表のとおり |
| ストレージ | 20 GiB gp3（無料枠は 30GiB まで） |

セキュリティグループ（インバウンドルール）:

| タイプ | ポート | ソース | 用途 |
| --- | --- | --- | --- |
| SSH | 22 | **マイIP** | 自分の PC からの SSH のみ許可 |
| HTTP | 80 | 0.0.0.0/0 | 証明書取得・HTTPS へのリダイレクト |
| HTTPS | 443 | 0.0.0.0/0 | サイト公開・Stripe Webhook |

> 3000（Next.js）と 3306（MariaDB）は**開けません**。外部からは Nginx 経由でのみアクセスさせます。

### 2-2. Elastic IP を割り当てる

EC2 →「Elastic IP」→「Elastic IP アドレスを割り当てる」→ 割り当てた IP を選択 →「アクション」→「Elastic IP アドレスの関連付け」→ 作成したインスタンスを選択。

これでインスタンスを再起動しても IP が変わらなくなります。この IP が `<EIP>`、`<DOMAIN>` は例えば `54-12-34-56.sslip.io` です（sslip.io は IP をそのまま名前解決してくれる無料サービス）。

### 2-3. SSH で接続する

Windows の PowerShell で:

```powershell
# 鍵のパーミッションを自分だけに制限（初回のみ。しないと SSH が鍵を拒否する）
icacls "C:\path\to\<KEY>.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"

ssh -i "C:\path\to\<KEY>.pem" ubuntu@<EIP>
```

以降の `$` から始まるコマンドは、特に断りがなければ EC2 上で実行します。

---

## 3. サーバーの初期設定

### 3-1. パッケージ更新・タイムゾーン

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone Asia/Tokyo
```

### 3-2. スワップ追加（t3.micro で `next build` がメモリ不足で落ちるのを防ぐ）

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # Swap: 2.0Gi と表示されればOK
```

### 3-3. Node.js（nvm）と PM2

Next.js 16 は Node.js 20.9 以上が必要です。

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
node -v   # v20.9 以上であることを確認
npm install -g pm2
```

### 3-4. Nginx・MariaDB・Git・Certbot

```bash
sudo apt install -y nginx mariadb-server git certbot python3-certbot-nginx
```

---

## 4. データベース（JawsDB の代わり）

### 4-1. 初期セキュリティ設定

```bash
sudo mysql_secure_installation
```

質問には基本的に次のように答えます: 現在の root パスワード → Enter / unix_socket 認証に切替 → `n` / root パスワード変更 → `n`（root は sudo でのみ使う）/ 匿名ユーザー削除 → `Y` / root のリモートログイン禁止 → `Y` / test DB 削除 → `Y` / 権限リロード → `Y`。

### 4-2. DB とアプリ用ユーザーを作成

パスワードは推測されにくいものを自分で決めてください（下の `<DB_PASS>`）。

```bash
sudo mysql
```

```sql
CREATE DATABASE nextjs_samuraistore DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'samurai'@'localhost' IDENTIFIED BY '<DB_PASS>';
GRANT ALL PRIVILEGES ON nextjs_samuraistore.* TO 'samurai'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

MariaDB は Ubuntu の初期設定で `127.0.0.1` のみを待ち受けるため、外部からは接続できません（セキュリティグループでも 3306 を開けていません）。

### 4-3. エクスポートした .sql をインポート（MySQL Workbench の代わり）

**ローカル PC の PowerShell で** .sql を転送:

```powershell
scp -i "C:\path\to\<KEY>.pem" "C:\path\to\samurai.sql" ubuntu@<EIP>:~/
```

**EC2 上で** インポート:

```bash
mysql -u samurai -p nextjs_samuraistore < ~/samurai.sql
mysql -u samurai -p nextjs_samuraistore -e "SHOW TABLES;"
```

`products / users / orders / order_items / reviews / favorites / inquiries` の7テーブルが表示されれば OK です。

---

## 5. アプリを配置する

### 5-1. GitHub からクローン

リポジトリが **public** なら:

```bash
cd ~
git clone https://github.com/<GitHubユーザー名>/nextjs-ec-site.git samurai-store
```

**private** の場合は、EC2 上で読み取り専用のデプロイキーを作って登録します。

```bash
ssh-keygen -t ed25519 -C "ec2-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

表示された公開鍵を GitHub のリポジトリ →「Settings」→「Deploy keys」→「Add deploy key」に貼り付け（Allow write access はチェックしない）。その後:

```bash
git clone git@github.com:<GitHubユーザー名>/nextjs-ec-site.git ~/samurai-store
```

### 5-2. 環境変数ファイルを作成（`heroku config:set` の代わり）

JWT 用のランダム文字列を生成:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

`.env.production` を作成（`next build` / `next start` は本番時にこのファイルを自動で読み込みます）:

```bash
cd ~/samurai-store
nano .env.production
```

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=samurai
DB_PASS=<DB_PASS>
DB_NAME=nextjs_samuraistore
BASE_URL=https://<DOMAIN>
JWT_SECRET=<上で生成した文字列>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<.env.development と同じ公開可能キー>
STRIPE_SECRET_KEY=<.env.development と同じシークレットキー>
STRIPE_WEBHOOK_SECRET=<手順7で取得する whsec_... ※いったん仮の値でOK>
```

```bash
chmod 600 .env.production   # 自分以外読めないようにする
```

> `NEXT_PUBLIC_` で始まる変数はビルド時にブラウザ用 JS へ埋め込まれます。値を変えたら必ず再ビルドしてください。他の変数も、変更後は `pm2 restart` が必要です。

### 5-3. ビルドして PM2 で起動

```bash
cd ~/samurai-store
npm ci
npm run build
pm2 start npm --name samurai-store -- start
pm2 status        # status が online ならOK
curl -I http://127.0.0.1:3000   # HTTP/1.1 200 などが返ればOK
```

サーバー再起動時に自動起動させる:

```bash
pm2 startup       # 表示された「sudo env PATH=... pm2 startup ...」の1行をコピーして実行
pm2 save
```

---

## 6. Nginx と HTTPS

### 6-1. Nginx がアップロード画像を読めるようにする

Ubuntu 24.04 のホームディレクトリは他ユーザーから辿れないため、Nginx（www-data）が `public/uploads` を読めるよう通過権限だけ付けます。

```bash
chmod o+x /home/ubuntu /home/ubuntu/samurai-store /home/ubuntu/samurai-store/public
chmod -R o+rX /home/ubuntu/samurai-store/public/uploads
```

> `next start` はビルド後に追加された `public` 内のファイルを配信しない場合があるため、`/uploads/` は Nginx から直接配信します。これで管理画面から登録した商品画像も表示されます。

### 6-2. サイト設定

```bash
sudo nano /etc/nginx/sites-available/samurai-store
```

```nginx
server {
    listen 80;
    server_name <DOMAIN>;

    # 商品画像アップロード用（Nginx の既定は 1MB）
    client_max_body_size 10M;

    # アップロード画像は Nginx が直接配信
    location /uploads/ {
        alias /home/ubuntu/samurai-store/public/uploads/;
        expires 7d;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # App Router のストリーミングのためバッファリングを無効化
        proxy_buffering off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/samurai-store /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t          # syntax is ok / test is successful を確認
sudo systemctl reload nginx
```

ブラウザで `http://<DOMAIN>` を開き、トップページが表示されることを確認します。

### 6-3. Let's Encrypt で HTTPS 化

```bash
sudo certbot --nginx -d <DOMAIN>
```

メールアドレス入力 → 規約同意 `Y` → 案内メール `N`。完了すると Nginx 設定に 443 の設定と HTTP→HTTPS リダイレクトが自動で追加されます。証明書の自動更新も設定されるので、次で確認しておきます。

```bash
sudo certbot renew --dry-run
```

`https://<DOMAIN>` で鍵マーク付きで表示されれば OK です。

> HTTPS は必須です。ログイン Cookie は本番環境（`NODE_ENV=production`）で `secure: true` になるため、HTTP のままではログインできません。

---

## 7. Stripe の Webhook を設定する（教材の手順5と同じ）

Stripe ダッシュボード（テストモード）→ ワークベンチ →「Webhook」→ 送信先を追加。

| 項目 | 内容 |
| --- | --- |
| イベント | `checkout.session.completed` |
| 送信先の種類 | Webhook エンドポイント |
| エンドポイント URL | `https://<DOMAIN>/api/orders/webhook` |

作成後に表示される「署名シークレット」（`whsec_...`）をコピーし、EC2 の `.env.production` の `STRIPE_WEBHOOK_SECRET` を書き換えて再起動します。

```bash
cd ~/samurai-store
nano .env.production      # STRIPE_WEBHOOK_SECRET を差し替え
pm2 restart samurai-store --update-env
```

---

## 8. 動作確認

`https://<DOMAIN>` で教材と同じ項目を確認します。

- [ ] 認証機能（会員登録、ログイン、ログアウト）
- [ ] 商品表示（トップ、一覧、詳細）
- [ ] ページネーション、並べ替え、検索
- [ ] カート
- [ ] 決済（テストカード `4242 4242 4242 4242`）→ 決済後に `https://<DOMAIN>/account` に戻る → 注文履歴に反映される
- [ ] Stripe ダッシュボードの Webhook のイベント配信が `200` になっている
- [ ] お問い合わせ
- [ ] レビュー
- [ ] お気に入り
- [ ] 管理者の商品登録・編集・削除（**画像アップロードも表示されること**）
- [ ] マイページ（会員編集、パスワード変更、注文履歴、お気に入り）
- [ ] EC2 を再起動（`sudo reboot`）しても数十秒後にサイトが表示される

### うまくいかないとき

| 症状 | 確認すること |
| --- | --- |
| 502 Bad Gateway | `pm2 status` / `pm2 logs samurai-store` で Next.js が落ちていないか |
| `npm run build` が `Killed` で止まる | スワップが有効か（`free -h`） |
| DB エラー | `pm2 logs` の「SQL実行エラー」/ `.env.production` の DB 値 / `mysql -u samurai -p` で接続できるか |
| ログインしてもすぐログアウト状態 | HTTPS でアクセスしているか |
| 決済後 localhost に飛ぶ | 手順 1-1 の修正が反映されているか / `BASE_URL` |
| 注文が「仮登録」のまま | Webhook の URL・`STRIPE_WEBHOOK_SECRET`・Stripe 側の配信ログ |
| 画像アップロードで 413 | Nginx の `client_max_body_size` |
| アップロード画像が 404/403 | 手順 6-1 の権限、`sudo tail /var/log/nginx/error.log` |

---

## 9. コードを更新したときの再デプロイ（`git push heroku main` の代わり）

ローカルで `git push origin main` したあと、EC2 で:

```bash
cd ~/samurai-store
git pull origin main
npm ci
npm run build
pm2 restart samurai-store --update-env
```

> 管理画面からアップロード・削除した画像は `public/uploads` 内の変更として残ります。`git pull` が衝突した場合は `git status` で確認し、サーバー上の画像を消さないよう注意してください（本番でアップロードされた画像は Git で管理しないのが基本です）。

---

## 10. 費用・運用上の注意

- **費用**: 無料枠の範囲外では t3.micro・EBS・パブリック IPv4（Elastic IP を含む）に料金がかかります。AWS Budgets で月額予算アラートを設定しておくと安心です。
- **停止と削除**: 使わないときはインスタンスを「停止」すれば EC2 の時間課金は止まります（EBS と Elastic IP の料金は残る）。完全にやめるときは、インスタンスの「終了」に加えて Elastic IP の「解放」を忘れずに。
- **DB バックアップ**: 定期的に `mysqldump -u samurai -p nextjs_samuraistore > backup.sql` を取るか、EC2 の EBS スナップショットを作成してください。
- **秘密情報**: `.env.production` と `.pem` は Git にコミットしない・人に共有しないこと。
- **本番運用に進む場合**: Stripe の本番キーに差し替え、DB を Amazon RDS、画像を Amazon S3 に分離するとより堅牢になります。
