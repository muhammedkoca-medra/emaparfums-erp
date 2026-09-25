import { prepareTestDatabase } from "@atelier/db/testing";
import { workerTestDbUrl } from "./env.js";

/** Worker testleri API testleriyle paralel koşabilsin diye ayrı veritabanı kullanır. */
export default async function setup() {
  await prepareTestDatabase(workerTestDbUrl());
}
