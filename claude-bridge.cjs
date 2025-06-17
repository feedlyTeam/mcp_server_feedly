const { spawn } = require('child_process');

function callMCP(toolName, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['ts-node', 'server.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FEEDLY_TOKEN: process.env.FEEDLY_TOKEN || '',
      }
    });

    const request = {
      type: 'tool_request',
      tool: toolName,
      input
    };

    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      console.error('MCP STDERR:', data.toString());
    });

    child.on('exit', () => {
      try {
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const parsed = JSON.parse(lastLine);
        console.log('\n✅ Tool Output:\n', JSON.stringify({
          tool_name: toolName,
          output: parsed
        }, null, 2));
        resolve({ tool_name: toolName, output: parsed });
      } catch (err) {
        console.error('❌ Failed to parse MCP output:', output);
        reject(err);
      }
    });

    child.stdin.write(JSON.stringify(request) + '\n');
  });
}

// Simulate Claude sending a tool call
const simulatedClaudeToolCall = {
  tool_name: 'feedly_search',
  parameters: { query: 'artificial intelligence', count: 3 }
};

callMCP(simulatedClaudeToolCall.tool_name, simulatedClaudeToolCall.parameters)
  .then(response => console.log('\n🎯 Final Response to Claude:\n' + JSON.stringify(response, null, 2)))
  .catch(console.error);
