import type { Router as DataRouter } from "@remix-run/router";
import { createBrowserRouter } from "@remix-run/router";
import type { ReactElement } from "react";
import * as React from "react";
import { WithDataRouter } from "react-router-dom";

import { RemixEntry, RemixRoute } from "./components";
import type { EntryContext } from "./entry";
import type { RouteModules } from "./routeModules";
import { createClientDataRoutes } from "./rrr";

/* eslint-disable prefer-let/prefer-let */
declare global {
  var __remixContext: EntryContext;
  var __remixRouteModules: RouteModules;
  var __remixManifest: EntryContext["manifest"];
}
/* eslint-enable prefer-let/prefer-let */

// Module-scoped singleton to hold the router.  Extracted from the React lifecycle
// to avoid issues w.r.t. dual initialization fetches in concurrent rendering.
// Data router apps are expected to have a static route tree and are not intended
// to be unmounted/remounted at runtime.
let routerSingleton: DataRouter;

export interface RemixBrowserProps {}

/**
 * The entry point for a Remix app when it is rendered in the browser (in
 * `app/entry.client.js`). This component is used by React to hydrate the HTML
 * that was received from the server.
 */
export function RemixBrowser(_props: RemixBrowserProps): ReactElement {
  let entryContext = window.__remixContext;
  entryContext.manifest = window.__remixManifest;
  entryContext.routeModules = window.__remixRouteModules;
  // In the browser, we don't need this because a) in the case of loader
  // errors we already know the order and b) in the case of render errors
  // React knows the order and handles error boundaries normally.
  entryContext.appState.trackBoundaries = false;
  entryContext.appState.trackCatchBoundaries = false;

  if (!routerSingleton) {
    let routes = createClientDataRoutes(
      entryContext.manifest.routes,
      entryContext.routeModules,
      RemixRoute
    );
    let hydrationData = {
      loaderData: entryContext.routeData,
      actionData: entryContext.actionData,
      // TODO: handle errors
      errors: null,
    };
    routerSingleton = createBrowserRouter({
      hydrationData,
      window,
      routes,
    }).initialize();
  }
  let router = routerSingleton;

  return (
    <WithDataRouter router={router}>
      <RemixEntry context={entryContext} />
    </WithDataRouter>
  );
}
