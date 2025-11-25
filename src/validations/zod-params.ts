import { z } from "zod";

export const v_params = z.object({
  id: z.coerce.number(),
});

export type t_params = z.infer<typeof v_params>;
