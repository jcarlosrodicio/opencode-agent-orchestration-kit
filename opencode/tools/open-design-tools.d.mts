export type OpenDesignArgPresence = "required" | "optional";

export type OpenDesignToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly args: Readonly<Record<string, OpenDesignArgPresence>>;
  execute(args: Record<string, string | undefined>): Promise<string>;
};

export const OPEN_DESIGN_TOOLS: readonly OpenDesignToolDefinition[];

export function openDesignJsonSchema(args: Readonly<Record<string, OpenDesignArgPresence>>): {
  type: "object";
  properties: Record<string, { type: "string" }>;
  required: string[];
  additionalProperties: false;
};
