import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import * as YAML from 'yaml';

const BASE_URL = 'http://127.0.0.1:1234/v1';
const MODEL = 'qwen/qwen3-vl-8b';

const schema = {
  type: 'object',
  properties: {
    scene: {
      type: 'object',
      properties: {
        environment: {
          type: 'array',
          items: { type: 'string' },
          description: 'Environmental elements (e.g., room, green walls)',
        },
        atmosphere: {
          type: 'array',
          items: { type: 'string' },
          description: 'Atmospheric qualities (e.g., quiet, tense)',
        },
        lightSource: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Light sources and direction (e.g., sunlight from top-left)',
        },
      },
      required: ['environment', 'atmosphere', 'lightSource'],
    },
    objects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          position: {
            type: 'array',
            items: { type: 'string' },
            description: 'Position in frame (e.g., center, top-right)',
          },
          depth: {
            type: 'array',
            items: { type: 'string' },
            description: 'Depth layer (e.g., foreground, background)',
          },
          name: {
            type: 'array',
            items: { type: 'string' },
            description: 'Object name(s)',
          },
          attributes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Object attributes (e.g., red, paper, colorful)',
          },
          state: {
            type: 'array',
            items: { type: 'string' },
            description: 'Object state (e.g., fixed, moving)',
          },
          relativePosition: {
            type: 'array',
            items: { type: 'string' },
            description: 'Position relative to other objects',
          },
          shadow: {
            type: 'array',
            items: { type: 'string' },
            description: 'Shadow direction, intensity, length (empty if none)',
          },
          text: {
            type: 'string',
            description: 'Text visible on object (if any)',
          },
        },
        required: [
          'position',
          'depth',
          'name',
          'attributes',
          'state',
          'relativePosition',
          'shadow',
        ],
      },
      description: 'List of detected objects',
    },
  },
  required: ['scene', 'objects'],
};

const systemPrompt = `You are a visual scene analyzer. Analyze the provided image and extract structured information about the scene and objects.

Instructions:
1. Identify the scene environment, atmosphere, and lighting conditions
2. Detect all visible objects with their positions, attributes, and relationships
3. Note any text visible on objects
4. Describe shadows when present
5. Return ONLY valid JSON matching the specified schema
6. Use English for all descriptions
7. Be precise and factual - describe only what you can see`;

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
