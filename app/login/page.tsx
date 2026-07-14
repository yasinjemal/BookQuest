import AuthForm from "@/components/AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const requested = (await searchParams).next;
  const nextPath = requested && requested.startsWith("/") && !requested.startsWith("//") && requested.length <= 2000
    ? requested : undefined;
  return <AuthForm mode="login" nextPath={nextPath} />;
}
