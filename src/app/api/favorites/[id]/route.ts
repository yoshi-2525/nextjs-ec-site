import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';
import { getAuthUser, type AuthUser } from '@/lib/auth';

// 指定した商品IDがログイン者のお気に入りに登録されているかを取得
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // URLのパラメータから商品IDを取得
  const { id } = await context.params;
  const productId = parseInt(id, 10); // 数値に変換

  try {
    const user: AuthUser | null = await getAuthUser();
    if (!user) {
      return NextResponse.json({ message: 'ログインしてください。' }, { status: 401 });
    }

    // 商品IDとユーザーIDに紐づくお気に入りを取得
    const result = await executeQuery<{ id: number }>(`
      SELECT id FROM favorites
      WHERE product_id = ? AND user_id = ?
      ;`, [productId, user.userId]
    );

    // 見つかった場合はtrue、見つからなかった場合はfalse
    return NextResponse.json({ isFavorite: result.length > 0 });
  } catch (err) {
    console.error('お気に入り取得エラー：', err);
    return NextResponse.json({ message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

// 指定した商品IDのお気に入りを削除
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // URLのパラメータから商品IDを取得
  const { id } = await context.params;
  const productId = parseInt(id, 10); // 数値に変換

  try {
    const user: AuthUser | null = await getAuthUser();
    if (!user) {
      return NextResponse.json({ message: 'ログインしてください。' }, { status: 401 });
    }

    // お気に入り情報をfavoritesテーブルから削除（ログイン者のデータのみ）
    await executeQuery(`
      DELETE FROM favorites
      WHERE product_id = ? AND user_id = ?;
    `, [productId, user.userId]);

    return NextResponse.json({ message: 'お気に入りを解除しました。' }, { status: 200 });
  } catch (err) {
    console.error('お気に入り削除エラー：', err);
    return NextResponse.json({ message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
