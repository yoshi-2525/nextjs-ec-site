'use client'; // クライアント（ブラウザ）側で動作

import ContactForm from '@/components/ContactForm';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from "next/link";

// 問い合わせ編集ページ
export default function UserRegisterPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState(''); // エラーメッセージ

  // フォーム送信時のイベントハンドラ
  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault(); // デフォルトの送信動作をキャンセル
    setErrorMessage(''); // 送信前にエラーをクリア

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const message = formData.get('message') as string;

    // 入力データのバリデーション
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      setErrorMessage('すべての項目を入力してください。');
      return;
    }

    try { // 送信APIにPOSTリクエストを送信
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        body: JSON.stringify({ name, email, message }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) { // 送信成功時はトップページへ遷移
        router.push('/?submitted=1'); // 送信成功をクエリパラメータで通知
      } else { // 送信失敗時はエラー情報を表示
        const data = await res.json();
        setErrorMessage(data.message || '送信に失敗しました。');
      }
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    }
  };

  return (
    <main className="max-w-md mx-auto py-10">
        <div className='mb-8'>
            <Link href="/" className="text-blue-600 hover:underline">←トップページに戻る</Link>
        </div>

      <h1 className="text-center mb-4">お問い合わせ</h1>
      {errorMessage && (
        <p className="text-red-600 text-center mt-8">{errorMessage}</p>
      )}
      <ContactForm
        onSubmit={handleSubmit}
        submitLabel="送信"
      />
    </main>
  );
}