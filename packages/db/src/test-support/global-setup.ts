import { prepareTestDatabase } from "../testing.js";
import { dbTestUrl } from "./env.js";

export default async function setup() {
  await prepareTestDatabase(dbTestUrl());
}
