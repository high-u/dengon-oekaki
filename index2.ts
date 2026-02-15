import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import * as YAML from 'yaml';

const BASE_URL = 'http://127.0.0.1:1234/v1';
const MODEL = 'qwen/qwen3-vl-4b';

const schema = {
  type: 'object',
  properties: {
    perception_stream: {
      type: 'array',
      items: { type: 'string' },
      description: 'An ordered list of visual elements, sensations, context, and details, sorted by attention priority.',
    },
  },
  required: ['perception_stream'],
};

const systemPrompt = `You are a pure Visual Sensor. Your goal is to output a "Stream of Consciousness" describing the image.

# Instructions
1. **No Categorization:** Do not separate objects, colors, or feelings. Mix them all into a single flat list.
2. **Order by Attention:** List elements in the order they catch your eye.
   - What is the first thing you see? (Global context? A bright color? A face?)
   - Then, move to secondary details.
   - Finally, notice subtle textures or background elements.
3. **Capture Everything:**
   - Physical objects (e.g., "red chair")
   - Sensory qualities (e.g., "cold light", "rough texture")
   - Abstract atmosphere (e.g., "lonely", "busy")
   - Text/Data (e.g., "sign says STOP")
4. **Format:**
   - Return a JSON object with a single key 'perception_stream' containing an array of strings.
   - Keep strings short and punchy.

# Example
Input: (Image of a rainy city street)
Output:
{
  "perception_stream": [
    "gloomy grey sky",
    "wet asphalt reflecting lights",
    "red umbrella in the center",
    "person hunching shoulders",
    "cold rain",
    "blurred skyscrapers",
    "neon sign 'OPEN'",
    "feeling of isolation",
    "sound of splashing water"
  ]
}`;

async function main() {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error('Usage: bun run index.ts <image_path>');
    process.exit(1);
  }

  if (!existsSync(imagePath)) {
    console.error(`Error: File not found: ${imagePath}`);
    process.exit(1);
  }

  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = imagePath.split('.').pop()?.toLowerCase() || 'png';
  const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
            {
              type: 'text',
              text: 'Analyze this image and return structured JSON output.',
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'scene_analysis',
          strict: true,
          schema: schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error (${response.status}): ${errorText}`);
    process.exit(1);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;

  if (content) {
    const parsed = JSON.parse(content);
    const yamlContent = YAML.stringify(parsed);

    const yamlPath = join(
      dirname(imagePath),
      `${basename(imagePath, extname(imagePath))}.yaml`,
    );
    writeFileSync(yamlPath, yamlContent, 'utf-8');

    console.log(`Saved: ${yamlPath}`);
  } else {
    console.error('No content in response');
    process.exit(1);
  }
}

main().catch(console.error);
