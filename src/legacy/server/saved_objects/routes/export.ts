/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import Hapi from 'hapi';
import Joi from 'joi';
import stringify from 'json-stable-stringify';
import { SavedObjectsClient } from '../';
import { getSortedObjectsForExport } from '../lib/export';
import { Prerequisites } from './types';

const ALLOWED_TYPES = ['index-pattern', 'search', 'visualization', 'dashboard'];

interface ExportRequest extends Hapi.Request {
  pre: {
    savedObjectsClient: SavedObjectsClient;
  };
  payload: {
    type?: string[];
    objects?: Array<{
      type: string;
      id: string;
    }>;
  };
}

export const createExportRoute = (prereqs: Prerequisites, server: Hapi.Server) => ({
  path: '/api/saved_objects/_export',
  method: 'POST',
  config: {
    pre: [prereqs.getSavedObjectsClient],
    validate: {
      payload: Joi.object()
        .keys({
          type: Joi.array()
            .items(Joi.string().valid(ALLOWED_TYPES))
            .single()
            .optional(),
          objects: Joi.array()
            .items({
              type: Joi.string()
                .valid(ALLOWED_TYPES)
                .required(),
              id: Joi.string().required(),
            })
            .max(server.config().get('savedObjects.maxImportExportSize'))
            .optional(),
        })
        .xor('type', 'objects')
        .default(),
    },
    async handler(request: ExportRequest, h: Hapi.ResponseToolkit) {
      const { savedObjectsClient } = request.pre;
      const docsToExport = await getSortedObjectsForExport({
        savedObjectsClient,
        types: request.payload.type,
        objects: request.payload.objects,
        exportSizeLimit: server.config().get('savedObjects.maxImportExportSize'),
      });
      return h
        .response(docsToExport.map(doc => stringify(doc)).join('\n'))
        .header('Content-Disposition', `attachment; filename="export.ndjson"`)
        .header('Content-Type', 'application/ndjson');
    },
  },
});
