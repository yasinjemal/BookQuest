import VerifyEmailClient from "@/components/VerifyEmailClient";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <VerifyEmailClient
      verified={params.verified === "1"}
      invalid={params.error === "1"}
    />
  );
}
