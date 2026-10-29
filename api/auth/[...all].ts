import { toNodeHandler } from "better-auth/node";
import { auth } from "../../server/auth.js";

export default toNodeHandler(auth);
