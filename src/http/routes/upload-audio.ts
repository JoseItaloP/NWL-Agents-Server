import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';
import { db } from '../../db/connection.ts';
import { schema } from '../../db/schema/index.ts';
import { generateEmbeddings, transcribeAudio } from '../../services/gemine.ts';

export const uploadAudioRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/rooms/:roomId/audio',
    {
      schema: {
        params: z.object({
          roomId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { roomId } = request.params;
      const audio = await request.file();
      if (!audio) {
        throw new Error('Audio is required.');
      }
      const audioBiffer = await audio.toBuffer();
      const audioAsBase64 = audioBiffer.toString('base64');
      const trasnscription = await transcribeAudio(
        audioAsBase64,
        audio.mimetype
      );
      const embeddings = await generateEmbeddings(trasnscription);

      const result = await db.insert(schema.audioChunks).values({
        roomId,
        trasnscription,
        embeddings,
      }).returning()
      const chunck = result[0]

      if(!chunck){
        throw new Error('Erro ao salvar chunk de áudio.')
      }

      return reply.status(201).send({chunkId: chunck.id})
    }
  );
};
