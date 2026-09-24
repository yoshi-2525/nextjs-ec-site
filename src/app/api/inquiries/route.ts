import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db'; // DB共通モジュール
import { isAdmin } from '@/lib/auth'; // 認証モジュール

// 問い合わせデータの型定義
type Contact = {
  id: number;
  name: string;
  email: string;
  message: string;
  created_at: Date;
};

// 問い合わせ一覧を取得（管理者のみ）
export async function GET() {
  // 管理者以外はアクセス不可
  if (!(await isAdmin())) {
    return NextResponse.json({ message: '権限がありません。' }, { status: 403 });
  }

  try { // DBから問い合わせを取得
    const result = await executeQuery<Contact>(
      'SELECT * FROM inquiries;',
    );

    // 取得した問い合わせを返却
    return NextResponse.json(result);
  } catch (err) {
    console.error('問い合わせ取得エラー：', err);
    return NextResponse.json(
      { message: 'サーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}

// 新規問い合わせのデータを登録
export async function POST(request: NextRequest) {
  try {
    // リクエストに含まれる各データを取得
    const { name, email, message } = await request.json();

    // 未入力チェック
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return NextResponse.json({ message: 'すべての項目を入力してください。' }, { status: 400 });
    }

    // メールアドレスの入力形式チェック（使える記号は.と@のみとする）
    const emailPattern = /^[a-zA-Z0-9.]+@[a-zA-Z0-9.]+$/;
    if (!emailPattern.test(email)) {
      return NextResponse.json({ message: '正しいメールアドレスの形式で入力してください。' }, { status: 400 });
    }

    // 問い合わせ情報をinquiriesテーブルに追加
    await executeQuery(`
      INSERT INTO inquiries (name, email, message)
      VALUES (?, ?, ?);
      `, [name, email,message]
    );

    return NextResponse.json({ message: '問い合わせの送信が完了しました。' });
  } catch (err) {
    console.error('問い合わせエラー：', err);
    return NextResponse.json({ message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

