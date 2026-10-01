/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authGuard from "../authGuard.js";
import type * as crons from "../crons.js";
import type * as digest from "../digest.js";
import type * as digestData from "../digestData.js";
import type * as feedbackFns from "../feedbackFns.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as keywordStats from "../keywordStats.js";
import type * as labels from "../labels.js";
import type * as lib_github from "../lib/github.js";
import type * as lib_resendClient from "../lib/resendClient.js";
import type * as matchesApi from "../matchesApi.js";
import type * as migrate from "../migrate.js";
import type * as ml from "../ml.js";
import type * as onboarding from "../onboarding.js";
import type * as otp from "../otp.js";
import type * as profile from "../profile.js";
import type * as resume from "../resume.js";
import type * as scoring from "../scoring.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authGuard: typeof authGuard;
  crons: typeof crons;
  digest: typeof digest;
  digestData: typeof digestData;
  feedbackFns: typeof feedbackFns;
  http: typeof http;
  ingest: typeof ingest;
  keywordStats: typeof keywordStats;
  labels: typeof labels;
  "lib/github": typeof lib_github;
  "lib/resendClient": typeof lib_resendClient;
  matchesApi: typeof matchesApi;
  migrate: typeof migrate;
  ml: typeof ml;
  onboarding: typeof onboarding;
  otp: typeof otp;
  profile: typeof profile;
  resume: typeof resume;
  scoring: typeof scoring;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
