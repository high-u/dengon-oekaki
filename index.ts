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
        timeAndWeather: {
          type: 'array',
          items: { type: 'string' },
          description: 'Time of day, lighting quality, and weather (e.g., early morning, golden hour, overcast, harsh sunlight, night)',
        },
        viewpoint: {
          type: 'array',
          items: { type: 'string' },
          description: 'Camera angle and observer position keywords (e.g., eye-level, looking down, looking up, aerial view, drone shot, POV, low angle)',
        },
      },
      required: ['environment', 'atmosphere', 'lightSource', 'viewpoint'],
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
            description: 'Depth or vertical layer (e.g., foreground, background, sea level, floating, on the floor)',
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
          texture: {
            type: 'array',
            items: { type: 'string' },
            description: 'Material and tactile quality (e.g., wooden, metallic, fluffy, rough, wet, glassy, grainy)',
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
          text: {
            type: 'string',
            description: 'Text visible on object (if any)',
          },
        },
        required: [
          'position',
          'name',
        ],
      },
      description: 'List of detected objects',
    },
  },
  required: ['scene', 'objects'],
};

const systemPrompt = `You are a Visual Experience Encoder. Your goal is to translate visual input into a structured format that allows a text-only AI to "hallucinate" the scene as if it were seeing it through its own eyes.

Focus on capturing the "Subjective Experience" of the scene (Where am I? What does it feel like? What time is it?) rather than just listing data.

# Instructions

## 1. Establish the Observer (Scene.Viewpoint)
- You must define the camera's position and angle using the 'viewpoint' array.
- Use specific keywords to ground the observer: "eye-level", "aerial view", "top-down", "low angle", "drone shot", "POV".
- Combine keywords to be precise (e.g., ["looking down", "high altitude"]).

## 2. Encode Atmosphere & Time (Scene.TimeAndWeather)
- Instead of describing shadows physically, infer the 'timeAndWeather' context.
- Use evocative terms: "golden hour", "harsh noon sunlight", "overcast", "twilight".
- Capture the mood in 'atmosphere' (e.g., "bustling", "serene", "melancholic").

## 3. Objects & Regions
- **Everything is an Object:** Treat massive regions (e.g., "Ocean", "Sky", "Beach", "Forest") as objects.
- **Positioning:** Use 'position' arrays to describe 2D layout (e.g., ["left half", "upper region"]).
- **Depth:** Use 'depth' to describe vertical layers or distance if relevant (e.g., ["sea level"], ["foreground"], ["horizon"]).

## 4. Tactile Sensation (Objects.Texture)
- Use the 'texture' field to convey physical materiality.
- Describe how surfaces would feel to the touch: "grainy", "wet", "viscous", "rough", "fluffy", "metallic", "cold".

## 5. Formatting
- Output ONLY valid JSON matching the schema.
- Use arrays for all descriptions to allow for multiple nuances (e.g., attributes: ["red", "rusty"]).
- Be concise but descriptive.`;

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
