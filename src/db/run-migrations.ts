import { runMigrations } from "./migrate";
import { pool } from "./index";

runMigrations()
  .then(() => console.log("migrations applied"))
  .finally(() => pool.end());
