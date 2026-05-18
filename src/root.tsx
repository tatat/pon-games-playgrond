import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'

export default function Root() {
  return (
    <html lang="ja">
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"
        />
        <title>Pon Pon Games Playground</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Kaisei+Decol:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          html, body {
            margin: 0;
            height: 100%;
            background: #000;
          }
          body {
            touch-action: none;
            overflow: hidden;
            font-family: system-ui, sans-serif;
            color: #fff;
            /* Suppress iOS Safari's long-press callout over game canvas. */
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
          }
        `}</style>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}
