import { verifyToken } from "@/lib/verifyToken";
import ChatPage from "@/components/ChatPage";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ChatRoute({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  const result = verifyToken(token);

  if (!result.valid || !result.payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center p-8 max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-red-700 mb-2">Access Denied</h1>
          <p className="text-red-600 mb-2">{result.reason ?? "Invalid token"}</p>
          <p className="text-gray-500 text-sm mt-4">
            Please open this page from your Bubble app.
          </p>
        </div>
      </div>
    );
  }

  return <ChatPage companyContext={result.payload.company} />;
}
