import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';
import { db } from '../../db/connection.ts';
import { schema } from '../../db/schema/index.ts';
import { generateAnswer, generateEmbeddings } from '../../services/gemine.ts';

export const createQuestionRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/rooms/:roomId/questions',
    {
      schema: {
        params: z.object({
          roomId: z.string(),
        }),
        body: z.object({
          question: z.string().min(1),
        }),
      },
    },
    async ({ body, params }, reply) => {
      const { question } = body;
      const { roomId } = params;

      const embeddings = await generateEmbeddings(question);
      const embeddingsAssString = `[${embeddings.join(',')}]`;
      const chunks = await db
        .select({
          id: schema.audioChunks.id,
          transcription: schema.audioChunks.trasnscription,
          similarity: sql<number>`1 - (${schema.audioChunks.embeddings}<=>${embeddingsAssString}::vector)`,
        })
        .from(schema.audioChunks)
        .where(
          and(
            eq(schema.audioChunks.roomId, roomId),
            sql`1 - (${schema.audioChunks.embeddings}<=>${embeddingsAssString}::vector) > 0.7`
          )
        )
        .orderBy(
          sql`${schema.audioChunks.embeddings}<=>${embeddingsAssString}::vector`
        )
        .limit(3);

      let answer: string | null = null;

      if (chunks.length > 0) {
        const transcription = chunks.map((chunk) => chunk.transcription);
        answer = await generateAnswer(question, transcription);
      }

      const result = await db
        .insert(schema.questions)
        .values({
          question,
          roomId,
          answer,
        })
        .returning();

      const insertedQuestionId = result[0];

      if (!insertedQuestionId) {
        throw new Error('Failed to create new Room');
      }

      return reply
        .status(201)
        .send({ questionId: insertedQuestionId.id, answer });
    }
  );
};
  