// Project-specific augmentation of the ambient `Cloudflare.Env` type (see the doc comment on
// `Cloudflare.Env` in @cloudflare/workers-types: "You can use `wrangler types` to generate the
// `Env` type automatically" — this hand-written equivalent avoids pulling in `wrangler types`'
// full generated runtime-type file, which duplicates @cloudflare/workers-types' declarations).
//
// This is what makes `env.GAME_ROOM` resolve to a typed binding for `cloudflare:test`'s `env`
// export (used throughout server/test/*.test.ts) instead of failing with "Property 'GAME_ROOM'
// does not exist on type 'Env'".
declare namespace Cloudflare {
  interface Env {
    GAME_ROOM: DurableObjectNamespace;
  }
}
