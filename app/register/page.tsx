import AuthForm from "@/components/AuthForm";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const requested = (await searchParams).next;
  const nextPath = requested && requested.startsWith("/") && !requested.startsWith("//") && requested.length <= 2000
    ? requested : undefined;
  return <AuthForm mode="register" nextPath={nextPath} />;
}
