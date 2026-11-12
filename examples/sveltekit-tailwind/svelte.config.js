// A Node server (`node build`) that runs in any container or VM; on Vercel,
// which runs functions rather than a Node server, Vercel's own adapter. The
// code is the same on every host, and the CDN in front of it is chosen by
// configuration at deploy time — see README.md.
const { default: adapter } = await import(
  process.env.VERCEL ? '@sveltejs/adapter-vercel' : '@sveltejs/adapter-node'
)

export default {
  kit: { adapter: adapter() }
}
