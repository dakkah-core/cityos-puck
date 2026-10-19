import type { Metadata } from "next";
import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "../../mdx-components";

type Props = { params: Promise<{ mdxPath?: string[] }> };
export const generateStaticParams = generateStaticParamsFor("mdxPath");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mdxPath } = await params;
  const { metadata } = await importPage(mdxPath);
  return { ...metadata, alternates: { canonical: `/${(mdxPath ?? []).join("/")}` } };
}

const Wrapper = getMDXComponents().wrapper;

export default async function DocsPage({ params }: Props) {
  const resolvedParams = await params;
  const { default: Content, toc, metadata, sourceCode } = await importPage(resolvedParams.mdxPath);
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <Content params={resolvedParams} />
    </Wrapper>
  );
}
