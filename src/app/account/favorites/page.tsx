'use client'; // クライアント（ブラウザ）側で動作

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useCart } from '@/hooks/useCart';
import { type FavoriteData } from '@/app/api/favorites/route';

// お気に入り一覧ページ
export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteData[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null); // 解除処理中の商品ID
  const { addItem, isInCart } = useCart();
  // クライアント側での描画かどうか（サーバー描画・ハイドレーション時はfalse）
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false);

  // 初期表示時にお気に入りデータを取得
  useEffect(() => {
    const getFavorites = async () => {
      try {
        const res = await fetch('/api/favorites');
        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.message || 'お気に入りの取得に失敗しました。');
          return;
        }
        setFavorites(data.favorites); // お気に入りデータを更新
      } catch (err) {
        console.error(err);
        setErrorMessage('通信エラーが発生しました。');
      } finally {
        setLoading(false); // 読み込み終了
      }
    };

    // お気に入りデータを取得
    getFavorites();
  }, []);

  if (loading) return <p className="text-center py-12 text-gray-600 text-lg">お気に入りデータを読み込み中です...</p>;
  if (errorMessage) return <p className="text-center py-12 text-red-600">{errorMessage}</p>;
  if (favorites.length === 0) return <p className="text-center py-12 text-gray-500">お気に入り商品はありません。</p>;

  // カートに追加ボタン押下時のイベントハンドラ
  const handleCart = (item: FavoriteData) => {
    let imageUrl = '';
    if (item.image_url) {
      imageUrl = item.image_url;
    }

    addItem({
      id: item.product_id.toString(),
      title: item.name,
      price: item.price,
      imageUrl: imageUrl,
    }, 1);
  };

  // お気に入り解除ボタン押下時のイベントハンドラ
  const handleRemove = async (productId: number) => {
    setRemovingId(productId);
    try {
      const res = await fetch(`/api/favorites/${productId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'お気に入りの解除に失敗しました。');
        return;
      }
      // 削除成功時は一覧から除外
      setFavorites(prev => prev.filter(f => f.product_id !== productId));
    } catch {
      alert('通信エラーが発生しました。');
    } finally {
      setRemovingId(null);
    }
  };

  // 商品画像のURLを取得（画像がない場合はダミー画像）
  const getImageUrl = (item: FavoriteData) => {
    if (item.image_url) {
      return `/uploads/${item.image_url}`;
    }
    return '/images/no-image.jpg';
  };

  // 売り切れかどうか
  const isSoldOut = (item: FavoriteData) => {
    if (item.stock === null || item.stock === undefined) return true;
    return item.stock <= 0;
  };

  // カートに追加済みかどうか
  const isAddedToCart = (item: FavoriteData) => {
    if (!isClient) return false;
    return isInCart(item.product_id.toString());
  };

  // カートボタンの表示文言を決定
  const getCartButtonLabel = (item: FavoriteData) => {
    if (isSoldOut(item)) return '売り切れ';
    if (isAddedToCart(item)) return '追加済み';
    return 'カートに追加';
  };

  // ボタンの共通スタイル
  const buttonStyle = 'py-2 px-4 rounded-sm';

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="my-4">
        <Link href="/account" className="text-indigo-600 hover:underline">
          ← マイページに戻る
        </Link>
      </div>
      <h1 className="text-center mb-8">お気に入り一覧</h1>
      <div className="space-y-4 max-w-3xl mx-auto">
        {favorites.map((item) => {
          const cartDisabled = isSoldOut(item) || isAddedToCart(item);

          return (
            <div key={item.id} className="flex items-center gap-4 border border-gray-300 rounded-md shadow-sm p-4">
              {/* 商品画像 */}
              <Link href={`/products/${item.product_id}`} className="flex-shrink-0">
                <Image
                  src={getImageUrl(item)}
                  alt={item.name || '商品画像'}
                  width={120}
                  height={120}
                  className="w-[120px] h-[120px] object-cover rounded-sm hover:opacity-80"
                />
              </Link>

              {/* 商品情報 */}
              <div className="flex-grow">
                <p className="text-lg font-semibold">{item.name}</p>
                <p className="text-indigo-600 font-bold">
                  ¥{item.price.toLocaleString()}
                  <span className="text-sm font-normal text-gray-500">（税込）</span>
                </p>
              </div>

              {/* 操作ボタン */}
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button
                  onClick={() => handleCart(item)}
                  disabled={cartDisabled}
                  className={`${buttonStyle} min-w-[130px] text-white bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 disabled:cursor-not-allowed`}
                >
                  {getCartButtonLabel(item)}
                </button>
                <button
                  onClick={() => handleRemove(item.product_id)}
                  disabled={removingId === item.product_id}
                  className={`${buttonStyle} border border-red-500 text-red-500 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  お気に入り解除
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
