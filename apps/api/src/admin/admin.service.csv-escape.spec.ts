import { AdminService } from './admin.service';

// escapeCsvCell / csvField are pure helpers; call them through the prototype so we
// do not need to build the whole service with its dependencies.
const proto = AdminService.prototype as unknown as {
  escapeCsvCell(v: string): string;
  csvField(v: string): string;
};
const escapeCell = (v: string) => proto.escapeCsvCell.call({}, v);
const field = (v: string) => proto.csvField.call({ escapeCsvCell: proto.escapeCsvCell }, v);

describe('CSV export escaping', () => {
  it('doubles embedded quotes so a value cannot close its own cell', () => {
    expect(field('a","=HYPERLINK("http://evil","x")')).toBe('"a"",""=HYPERLINK(""http://evil"",""x"")"');
  });

  it('keeps commas inside one quoted cell', () => {
    expect(field('1234567,=cmd|x')).toBe('"1234567,=cmd|x"');
  });

  it('neutralises formula starters with a leading tab', () => {
    for (const bad of ['=1+1', '+63917', '-5', '@SUM(A1)', '\t=1']) {
      expect(escapeCell(bad).startsWith('\t')).toBe(true);
    }
  });

  it('flattens line breaks so a value cannot start a new row', () => {
    expect(field('line1\r\nline2\nline3')).toBe('"line1 line2 line3"');
  });

  it('leaves normal text unchanged', () => {
    expect(field('Juan Dela Cruz')).toBe('"Juan Dela Cruz"');
    expect(field('')).toBe('""');
  });
});
