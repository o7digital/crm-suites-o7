"use client";
import { useParams } from "next/navigation";
import { SigningPage } from "@/components/signatures/SigningPage";
export default function Page() {
  const { token } = useParams<{ token: string }>();
  return <SigningPage key={token} token={token} />;
}
