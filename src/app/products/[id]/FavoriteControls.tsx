'use client'; // クライアント（ブラウザ）側で動作

import { useState } from 'react';

// お気に入り制御用コンポーネントに渡すデータ（props）の型定義
type FavoriteControlsProps = {
  productId: number;
  initialFavorite: boolean; // 初期のお気に入り状態
};

// お気に入り制御用コンポーネント（商品詳細ページ専用）
export default function FavoriteControls({ productId, initialFavorite }: FavoriteControlsProps) {
  const [isFavorite, setIsFavorite] = useState(initialFavorite); // お気に入り状態
  const [processing, setProcessing] = useState(false); // 処理中フラグ

  // お気に入りリンク押下時のイベントハンドラ
  const handleFavorite = async () => {
    setProcessing(true);
    try {
      // 追加済みなら解除（DELETE）、未追加なら追加（POST）
      const res = isFavorite
        ? await fetch(`/api/favorites/${productId}`, { method: 'DELETE' })
        : await fetch('/api/favorites', {
            method: 'POST',
            body: JSON.stringify({ productId }),
            headers: { 'Content-Type': 'application/json' },
          });

      if (res.ok) { // 成功時は反対のお気に入り状態に切り替え
        setIsFavorite(!isFavorite);
      } else {
        const data = await res.json();
        alert(data.message || 'お気に入りの更新に失敗しました。');
      }
    } catch {
      alert('通信エラーが発生しました。');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <button
      onClick={handleFavorite}
      disabled={processing}
      className="text-teal-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ fontFamily: 'sans-serif' }}
    >
      {isFavorite ? '♥ お気に入り解除' : '♡ お気に入り追加'}
    </button>
  );
}
