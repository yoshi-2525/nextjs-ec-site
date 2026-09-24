import { executeQuery } from '@/lib/db'; // DB共通モジュール

// 問い合わせデータの型定義
type Inquiry = {
  id: number;
  name: string;
  email: string;
  message: string;
  created_at: string | Date;
};

// 管理者用の問い合わせ一覧ページ（管理者以外は proxy.ts でログインページへ転送される）
export default async function AdminInquiriesPage() {
  // DBから問い合わせデータを取得（新しい順）
  let inquiries: Inquiry[];
  try {
    inquiries = await executeQuery<Inquiry>('SELECT * FROM inquiries ORDER BY created_at DESC;');
  } catch {
    return <p className="text-center text-gray-500 text-lg py-10">問い合わせ一覧の取得に失敗しました。</p>;
  }

  // テーブルの共通スタイル
  const tableStyle = 'px-5 py-3 border-b border-gray-300';

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-center">問い合わせ一覧</h1>

      <div className="shadow-lg rounded-lg overflow-hidden">
        <table className="min-w-full leading-normal">
          <thead>
            <tr className="bg-gray-200 text-gray-700 text-left">
              <th className={tableStyle}>ID</th>
              <th className={tableStyle}>氏名</th>
              <th className={tableStyle}>メールアドレス</th>
              <th className={tableStyle}>お問い合わせ内容</th>
              <th className={tableStyle}>送信日時</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.length === 0 ? (
              <tr>
                <td colSpan={5} className={`${tableStyle} text-center text-gray-500`}>
                  問い合わせはありません。
                </td>
              </tr>
            ) : (
              inquiries.map((inquiry) => (
                <tr key={inquiry.id} className="hover:bg-gray-100 align-top">
                  <td className={tableStyle}>{inquiry.id}</td>
                  <td className={tableStyle}>{inquiry.name}</td>
                  <td className={tableStyle}>{inquiry.email}</td>
                  <td className={`${tableStyle} whitespace-pre-wrap break-words`}>{inquiry.message}</td>
                  <td className={`${tableStyle} whitespace-nowrap`}>
                    {inquiry.created_at ? new Date(inquiry.created_at).toLocaleString('ja-JP') : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
