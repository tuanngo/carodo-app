import { Hono } from "hono";
import type { Child } from "hono/jsx";
import type { WebEnv } from "./env";

/**
 * Pages rendered on the server, answering without client script. A page reads through `c.env.API`
 * (the api's `WebRpc`) and holds no rule of its own (docs/decisions/0001).
 */
export const app = new Hono<{ Bindings: WebEnv }>();

function Page({ title, children }: { title: string; children: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{title}</title>
      </head>
      <body>{children}</body>
    </html>
  );
}

app.notFound((c) =>
  c.html(
    <Page title="Not found · Carodo">
      <main>
        <h1>This link is not available</h1>
        <p>It may have been turned off by the person who shared it.</p>
      </main>
    </Page>,
    404,
  ),
);
