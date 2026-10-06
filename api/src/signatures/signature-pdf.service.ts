import { Injectable, BadRequestException } from '@nestjs/common';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { SignatureEnvelope } from './signature.types';

@Injectable()
export class SignaturePdfService {
  private fontBytes?: Buffer;
  private async font(doc: PDFDocument) {
    doc.registerFontkit(fontkit);
    this.fontBytes ||= await readFile(
      join(process.cwd(), 'assets', 'NotoSans-Regular.ttf'),
    );
    return doc.embedFont(this.fontBytes, { subset: true });
  }
  async inspect(bytes: Buffer) {
    try {
      const doc = await PDFDocument.load(bytes);
      const pages = doc.getPages();
      if (!pages.length || pages.length > 30)
        throw new Error('Maximum 30 pages');
      if (pages.some((p) => p.getRotation().angle !== 0))
        throw new Error(
          'Export the PDF with page rotation flattened before uploading',
        );
      // Flatten editable PDF forms so the source becomes fixed before signing.
      doc.getForm().flatten();
      return {
        bytes: Buffer.from(await doc.save()),
        pages: pages.map((p) => p.getSize()),
      };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? `PDF: ${err.message}` : 'Invalid PDF',
      );
    }
  }
  async generate(body: string, variables: Record<string, string>) {
    const doc = await PDFDocument.create();
    const font = await this.font(doc);
    let page = doc.addPage([595.28, 841.89]);
    let y = 785;
    const rendered = body.replace(
      /\{\{\s*([\w.-]+)\s*\}\}/g,
      (_, key: string) => {
        if (!variables[key]?.trim())
          throw new BadRequestException(`Complete document variable: ${key}`);
        return variables[key];
      },
    );
    for (const paragraph of rendered.split('\n')) {
      let line = '';
      const lines: string[] = [];
      for (const word of paragraph.split(/\s+/)) {
        const chunks: string[] = [];
        let chunk = '';
        for (const character of word) {
          if (font.widthOfTextAtSize(chunk + character, 11) > 485 && chunk) {
            chunks.push(chunk);
            chunk = '';
          }
          chunk += character;
        }
        chunks.push(chunk);
        for (const part of chunks) {
          const next = line ? `${line} ${part}` : part;
          if (font.widthOfTextAtSize(next, 11) > 485 && line) {
            lines.push(line);
            line = part;
          } else line = next;
        }
      }
      lines.push(line);
      for (const content of lines) {
        if (y < 75) {
          page = doc.addPage([595.28, 841.89]);
          y = 785;
        }
        page.drawText(content, {
          x: 55,
          y,
          size: 11,
          font,
          maxWidth: 485,
          lineHeight: 16,
          color: rgb(0.07, 0.09, 0.12),
        });
        y -= 17;
      }
      if (doc.getPageCount() > 30)
        throw new BadRequestException('Document is too long');
    }
    return Buffer.from(await doc.save());
  }
  async signed(source: Buffer, e: SignatureEnvelope) {
    const doc = await PDFDocument.load(source);
    const font = await this.font(doc);
    for (const field of e.fields) {
      const recipient = e.recipients.find((r) => r.id === field.recipientId)!;
      const value = recipient.values?.[field.id];
      const page = doc.getPage(field.page - 1);
      const { width: pw, height: ph } = page.getSize();
      const x = field.x * pw,
        y = ph - (field.y + field.height) * ph,
        w = field.width * pw,
        h = field.height * ph;
      if (value?.image) {
        const image = await doc.embedPng(
          Buffer.from(value.image.split(',')[1], 'base64'),
        );
        const scaled = image.scale(Math.min(w / image.width, h / image.height));
        page.drawImage(image, {
          x,
          y: y + (h - scaled.height) / 2,
          width: scaled.width,
          height: scaled.height,
        });
      } else {
        const content =
          field.type === 'date'
            ? recipient.signedAt!.slice(0, 10)
            : field.preset !== undefined
              ? field.preset
              : value?.text;
        if (!content) continue;
        const size = Math.max(
          4,
          Math.min(
            field.type === 'signature' ? 20 : 12,
            h * 0.65,
            w / Math.max(font.widthOfTextAtSize(content, 1), 1),
          ),
        );
        page.drawText(content, {
          x,
          y: y + (h - size) / 2,
          font,
          size,
          color: rgb(0.05, 0.08, 0.13),
        });
      }
    }
    let certificate = doc.addPage([595.28, 841.89]);
    let y = 780;
    const write = (value: string, size = 10) => {
      let line = '';
      for (const character of value.replace(/[\r\n]/g, ' ')) {
        if (font.widthOfTextAtSize(line + character, size) > 500 && line) {
          if (y < 50) {
            certificate = doc.addPage([595.28, 841.89]);
            y = 780;
          }
          certificate.drawText(line, { x: 45, y, font, size });
          y -= size + 4;
          line = '';
        }
        line += character;
      }
      if (y < 50) {
        certificate = doc.addPage([595.28, 841.89]);
        y = 780;
      }
      certificate.drawText(line, { x: 45, y, font, size });
      y -= size + 12;
    };
    write('o7 CRM — Signature completion record', 17);
    write(e.title, 12);
    write(`Envelope: ${e.id}`);
    write(`Completed: ${e.completedAt}`);
    write('Source PDF SHA-256:', 9);
    write(e.originalHash, 8);
    for (const recipient of e.recipients) {
      write(`${recipient.name} — ${recipient.email}`, 10);
      write(`Email code verified: ${recipient.verifiedAt}`, 9);
      write(`Signed: ${recipient.signedAt}`, 9);
    }
    write(
      'Each signatory accepted the document and verified access to their email.',
      9,
    );
    write(
      'The CRM retains the source, signed PDF hashes and the event record.',
      9,
    );
    return Buffer.from(await doc.save());
  }
}
