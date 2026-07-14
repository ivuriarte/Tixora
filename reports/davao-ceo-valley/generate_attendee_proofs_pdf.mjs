import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const EVENT_ID = '955865e8-d3a1-44dd-9029-76618f2c9f7c';
const OUTPUT = path.resolve('reports/davao-ceo-valley/Davao_CEO_Valley_Attendee_Payment_Proofs.pdf');

const prisma = new PrismaClient();

function compactName(firstName, lastName) {
  return [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(' ');
}

function peso(value) {
  const amount = Number(value) / 100;
  const formatted = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `PHP ${formatted}`;
}

function manilaDate(value, withTime = true) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(value));
}

function proofImageUrl(url) {
  if (!url.includes('/upload/')) return url;
  return url.replace('/upload/', '/upload/f_jpg,q_auto:good/');
}

function fitText(font, text, maxWidth, startSize, minSize) {
  for (let size = startSize; size >= minSize; size -= 1) {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return size;
  }
  return minSize;
}

function truncate(font, text, size, maxWidth) {
  if (!text) return '-';
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let current = text;
  while (current.length > 1 && font.widthOfTextAtSize(`${current}...`, size) > maxWidth) {
    current = current.slice(0, -1);
  }
  return `${current.trim()}...`;
}

function drawText(page, text, options) {
  const safe = truncate(options.font, String(text ?? '-'), options.size, options.maxWidth ?? 500);
  page.drawText(safe, {
    x: options.x,
    y: options.y,
    size: options.size,
    font: options.font,
    color: options.color ?? rgb(0.08, 0.1, 0.14),
  });
}

function drawLabelValue(page, label, value, x, y, widths, fonts) {
  drawText(page, label, {
    x,
    y,
    font: fonts.bold,
    size: 8,
    maxWidth: widths.label,
    color: rgb(0.36, 0.4, 0.47),
  });
  drawText(page, value || '-', {
    x: x + widths.label + 8,
    y,
    font: fonts.regular,
    size: 10,
    maxWidth: widths.value,
    color: rgb(0.08, 0.1, 0.14),
  });
}

async function embedProofImage(pdf, url) {
  const response = await fetch(proofImageUrl(url));
  if (!response.ok) {
    throw new Error(`Could not fetch proof image (${response.status}) ${url}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (contentType.includes('png')) return pdf.embedPng(bytes);
  return pdf.embedJpg(bytes);
}

function drawPageFrame(page, pageSize) {
  const [width, height] = pageSize;
  page.drawRectangle({
    x: 34,
    y: 34,
    width: width - 68,
    height: height - 68,
    borderColor: rgb(0.86, 0.88, 0.91),
    borderWidth: 1,
  });
}

async function main() {
  const event = await prisma.event.findUnique({
    where: { id: EVENT_ID },
    select: { title: true, startsAt: true, venue: true, city: true },
  });
  if (!event) throw new Error('Event not found');

  const registrations = await prisma.registration.findMany({
    where: {
      eventId: EVENT_ID,
      status: 'verified',
      proofs: { some: {} },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      referenceNumber: true,
      status: true,
      attendeeCount: true,
      total: true,
      paymentMethod: true,
      createdAt: true,
      verifiedAt: true,
      attendees: {
        orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }],
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          company: true,
          jobTitle: true,
          isLead: true,
          checkedInAt: true,
        },
      },
      proofs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          imageUrl: true,
          status: true,
          createdAt: true,
          reviewedAt: true,
        },
      },
    },
  });

  const attendeeRows = registrations.flatMap((registration) =>
    registration.attendees.map((attendee) => ({
      registration,
      attendee,
      proof: registration.proofs[0],
    })),
  );

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${event.title} - Attendee Payment Proofs`);
  pdf.setAuthor('Axon Tickets');
  pdf.setSubject('Attendee details with proof of payment');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const pageSize = [595.28, 841.89];
  const margin = 54;
  const contentWidth = pageSize[0] - margin * 2;

  const cover = pdf.addPage(pageSize);
  drawPageFrame(cover, pageSize);
  drawText(cover, 'ATTENDEE PAYMENT PROOFS', {
    x: margin,
    y: 720,
    font: bold,
    size: 13,
    maxWidth: contentWidth,
    color: rgb(0.38, 0.18, 0.68),
  });
  const titleSize = fitText(bold, event.title, contentWidth, 26, 16);
  drawText(cover, event.title, {
    x: margin,
    y: 675,
    font: bold,
    size: titleSize,
    maxWidth: contentWidth,
  });
  drawText(cover, `${manilaDate(event.startsAt, false)} | ${event.venue}, ${event.city}`, {
    x: margin,
    y: 645,
    font: regular,
    size: 12,
    maxWidth: contentWidth,
    color: rgb(0.32, 0.36, 0.42),
  });
  drawLabelValue(cover, 'Generated', manilaDate(new Date()), margin, 585, { label: 90, value: 360 }, fonts);
  drawLabelValue(cover, 'Attendees', String(attendeeRows.length), margin, 562, { label: 90, value: 360 }, fonts);
  drawLabelValue(cover, 'Registrations', String(registrations.length), margin, 539, { label: 90, value: 360 }, fonts);
  drawText(cover, 'Each page pairs one attendee with the latest proof of payment from their registration.', {
    x: margin,
    y: 490,
    font: regular,
    size: 11,
    maxWidth: contentWidth,
    color: rgb(0.32, 0.36, 0.42),
  });

  const imageCache = new Map();
  for (let index = 0; index < attendeeRows.length; index += 1) {
    const { registration, attendee, proof } = attendeeRows[index];
    const page = pdf.addPage(pageSize);
    drawPageFrame(page, pageSize);

    drawText(page, event.title, {
      x: margin,
      y: 775,
      font: bold,
      size: 12,
      maxWidth: contentWidth,
      color: rgb(0.38, 0.18, 0.68),
    });
    drawText(page, `Attendee ${index + 1} of ${attendeeRows.length}`, {
      x: 450,
      y: 775,
      font: regular,
      size: 9,
      maxWidth: 90,
      color: rgb(0.47, 0.51, 0.58),
    });

    const attendeeName = compactName(attendee.firstName, attendee.lastName);
    drawText(page, attendeeName || 'Unnamed attendee', {
      x: margin,
      y: 735,
      font: bold,
      size: fitText(bold, attendeeName || 'Unnamed attendee', contentWidth, 22, 14),
      maxWidth: contentWidth,
    });

    page.drawLine({
      start: { x: margin, y: 713 },
      end: { x: pageSize[0] - margin, y: 713 },
      thickness: 1,
      color: rgb(0.86, 0.88, 0.91),
    });

    let y = 688;
    drawText(page, 'ATTENDEE DETAILS', {
      x: margin,
      y,
      font: bold,
      size: 9,
      maxWidth: contentWidth,
      color: rgb(0.36, 0.4, 0.47),
    });
    y -= 24;
    drawLabelValue(page, 'Email', attendee.email, margin, y, { label: 98, value: 360 }, fonts);
    y -= 20;
    drawLabelValue(page, 'Phone', attendee.phone, margin, y, { label: 98, value: 360 }, fonts);
    y -= 20;
    drawLabelValue(page, 'Company', attendee.company, margin, y, { label: 98, value: 360 }, fonts);
    y -= 20;
    drawLabelValue(page, 'Job Title', attendee.jobTitle, margin, y, { label: 98, value: 360 }, fonts);
    y -= 20;
    drawLabelValue(page, 'Checked In', attendee.checkedInAt ? manilaDate(attendee.checkedInAt) : 'No', margin, y, { label: 98, value: 360 }, fonts);

    y -= 42;
    drawText(page, 'REGISTRATION & PAYMENT', {
      x: margin,
      y,
      font: bold,
      size: 9,
      maxWidth: contentWidth,
      color: rgb(0.36, 0.4, 0.47),
    });
    y -= 24;
    drawLabelValue(page, 'Reference', registration.referenceNumber, margin, y, { label: 98, value: 360 }, fonts);
    y -= 20;
    drawLabelValue(page, 'Status', registration.status, margin, y, { label: 98, value: 360 }, fonts);
    y -= 20;
    drawLabelValue(page, 'Payment Method', registration.paymentMethod, margin, y, { label: 98, value: 360 }, fonts);
    y -= 20;
    drawLabelValue(page, 'Amount', peso(registration.total), margin, y, { label: 98, value: 360 }, fonts);
    y -= 20;
    drawLabelValue(page, 'Registered', manilaDate(registration.createdAt), margin, y, { label: 98, value: 360 }, fonts);
    y -= 20;
    drawLabelValue(page, 'Proof Uploaded', manilaDate(proof.createdAt), margin, y, { label: 98, value: 360 }, fonts);

    y -= 42;
    drawText(page, 'PROOF OF PAYMENT', {
      x: margin,
      y,
      font: bold,
      size: 9,
      maxWidth: contentWidth,
      color: rgb(0.36, 0.4, 0.47),
    });

    const imageBox = {
      x: margin,
      y: 62,
      width: contentWidth,
      height: y - 76,
    };
    page.drawRectangle({
      x: imageBox.x,
      y: imageBox.y,
      width: imageBox.width,
      height: imageBox.height,
      borderColor: rgb(0.86, 0.88, 0.91),
      borderWidth: 1,
      color: rgb(0.98, 0.98, 0.99),
    });

    try {
      let embedded = imageCache.get(proof.imageUrl);
      if (!embedded) {
        embedded = await embedProofImage(pdf, proof.imageUrl);
        imageCache.set(proof.imageUrl, embedded);
      }
      const scaled = embedded.scaleToFit(imageBox.width - 20, imageBox.height - 20);
      page.drawImage(embedded, {
        x: imageBox.x + (imageBox.width - scaled.width) / 2,
        y: imageBox.y + (imageBox.height - scaled.height) / 2,
        width: scaled.width,
        height: scaled.height,
      });
    } catch (error) {
      drawText(page, `Could not embed proof image: ${error.message}`, {
        x: imageBox.x + 16,
        y: imageBox.y + imageBox.height - 36,
        font: regular,
        size: 10,
        maxWidth: imageBox.width - 32,
        color: rgb(0.7, 0.16, 0.16),
      });
      drawText(page, proof.imageUrl, {
        x: imageBox.x + 16,
        y: imageBox.y + imageBox.height - 58,
        font: regular,
        size: 8,
        maxWidth: imageBox.width - 32,
        color: rgb(0.2, 0.24, 0.3),
      });
    }
  }

  await fs.writeFile(OUTPUT, await pdf.save());
  console.log(JSON.stringify({
    output: OUTPUT,
    event: event.title,
    registrations: registrations.length,
    attendees: attendeeRows.length,
    pages: pdf.getPageCount(),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
