import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';
import { getAuthUser, type AuthUser } from '@/lib/auth';

// お気に入りデータの型定義（favoritesテーブルの全カラム＋一覧表示用の商品情報）
export interface FavoriteData {
  id: number;
  product_id: number;
  user_id: number;
  created_at: string;
  name: string; // 商品名
  price: number; // 価格
  stock: number; // 在庫数
  image_url: string | null; // 商品画像
}

// ログイン者のお気に入り一覧を取得（登録日時が新しい順）
export async function GET() {
  try {
    const user: AuthUser | null = await getAuthUser();
    if (!user) {
      return NextResponse.json({ message: 'ログインしてください。' }, { status: 401 });
    }

    // お気に入り情報を取得（テーブル結合で商品情報も取得）
    const favorites = await executeQuery<FavoriteData>(`
      SELECT
        f.id,
        f.product_id,
        f.user_id,
        f.created_at,
        p.name,
        p.price,
        p.stock,
        p.image_url
      FROM favorites AS f
      JOIN products AS p ON f.product_id = p.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC, f.id DESC
      ;`, [user.userId]
    );

    return NextResponse.json({ favorites });
  } catch (err) {
    console.error('お気に入り取得エラー：', err);
    return NextResponse.json({ message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

// お気に入りを新規登録
export async function POST(request: NextRequest) {
  try {
    const user: AuthUser | null = await getAuthUser();
    if (!user) {
      return NextResponse.json({ message: 'ログインしてください。' }, { status: 401 });
    }

    // リクエストに含まれる商品IDを取得
    const body = await request.json();
    const productId = Number(body.productId);

    // 入力値のバリデーション
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ message: '商品IDが不正です。' }, { status: 400 });
    }

    // お気に入り情報をfavoritesテーブルに追加（登録済みの場合はスキップ）
    await executeQuery(`
      INSERT IGNORE INTO favorites (product_id, user_id)
      VALUES (?, ?);
    `, [productId, user.userId]);

    return NextResponse.json({ message: 'お気に入りに追加しました。' }, { status: 201 });
  } catch (err) {
    console.error('お気に入り登録エラー：', err);
    return NextResponse.json({ message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
