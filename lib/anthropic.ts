import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = 'claude-sonnet-4-6';
export const MAX_TOKENS = 1024;

export type { MessageParam, Tool };

export interface StreamChatOptions {
  messages: MessageParam[];
  systemPrompt: string;
  tools?: Tool[];
  onText: (text: string) => void;
  onToolStart?: (toolName: string) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Run a multi-turn conversation with Claude, streaming text chunks via onText.
 * Handles tool calls automatically in a loop (up to MAX_TOOL_ROUNDS).
 */
export async function streamChat(options: StreamChatOptions): Promise<void> {
  const {
    messages,
    systemPrompt,
    tools = [],
    onText,
    onToolStart,
    onToolResult,
    executeTool,
  } = options;

  let currentMessages: MessageParam[] = [...messages];
  const MAX_TOOL_ROUNDS = 4;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const hasTools = tools.length > 0 && round < MAX_TOOL_ROUNDS;

    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: currentMessages,
      ...(hasTools ? { tools } : {}),
    });

    // Stream text deltas to caller
    for await (const text of stream.textStream) {
      onText(text);
    }

    const finalMessage = await stream.finalMessage();

    // No tool calls — we're done
    if (finalMessage.stop_reason !== 'tool_use' || !hasTools) {
      break;
    }

    // Execute tool calls
    const toolResultContent: ToolResultBlockParam[] = [];

    for (const block of finalMessage.content) {
      if (block.type !== 'tool_use') continue;

      const toolName = block.name;
      const toolInput = block.input as Record<string, unknown>;

      onToolStart?.(toolName);

      let result: unknown;
      try {
        result = await executeTool(toolName, toolInput);
      } catch (err) {
        result = {
          error: err instanceof Error ? err.message : 'Tool execution failed',
        };
      }

      onToolResult?.(toolName, result);

      toolResultContent.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    // Add assistant response and tool results to message history for next round
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: finalMessage.content },
      { role: 'user', content: toolResultContent },
    ];
  }
}
