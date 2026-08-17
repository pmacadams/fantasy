/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Every route in this app is prerendered and gets its data from Supabase in
  // the browser — there is no server work to do at request time. Exporting to
  // plain HTML means Netlify serves it from the CDN with no Next.js runtime,
  // no serverless functions and no cold starts.
  //
  // Delete this line if you ever add an API route, middleware, or a server
  // component that fetches data. Everything else keeps working either way.
  output: "export",

  // Fonts load from the <link> in the layout. Next's inliner would fetch
  // fonts.googleapis.com during `next build`, which makes the build fail on any
  // machine or CI runner without outbound access to Google. Not worth it.
  optimizeFonts: false,
};

export default nextConfig;
