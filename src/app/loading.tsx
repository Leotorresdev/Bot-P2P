export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-6 px-4 py-7 sm:px-9">
      <div className="h-[68px] w-full animate-pulse rounded-[14px] border border-alpine-border bg-white" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="h-[420px] animate-pulse rounded-[18px] border border-alpine-border bg-white xl:col-span-5" />
        <div className="h-[420px] animate-pulse rounded-[18px] border border-alpine-border bg-white xl:col-span-7" />
      </div>
      <div className="h-[360px] w-full animate-pulse rounded-[18px] border border-alpine-border bg-white" />
    </div>
  );
}
