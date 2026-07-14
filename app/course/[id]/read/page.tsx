import DocumentReader from "@/components/DocumentReader";
export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) { return <DocumentReader courseId={Number((await params).id)} />; }
