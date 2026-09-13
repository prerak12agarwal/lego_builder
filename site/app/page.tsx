import { SampleWorkbench } from "@/components/sample-workbench";

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  // The sample remains the default public landing surface.
  return <SampleWorkbench initialScreen={view === "admin" ? "admin" : "workspace"}/>;
}
