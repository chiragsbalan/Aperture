import {describe, expect, it} from 'vitest';

import {filmographyHeading} from './person-filmography-heading';

describe('filmographyHeading', () => {
  it('uses a verb phrase for each catalog department', () => {
    expect(filmographyHeading('Zendaya', 'Acting')).toBe(
      'Titles starring Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Directing')).toBe(
      'Titles directed by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Production')).toBe(
      'Titles produced by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Writing')).toBe(
      'Titles written by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Editing')).toBe(
      'Titles edited by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Camera')).toBe(
      'Titles shot by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Sound')).toBe(
      'Titles with sound by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Art')).toBe(
      'Titles designed by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Costume & Make-Up')).toBe(
      'Titles with costumes and makeup by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Visual Effects')).toBe(
      'Titles with visual effects by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Lighting')).toBe(
      'Titles lit by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Creator')).toBe(
      'Titles created by Zendaya',
    );
    expect(filmographyHeading('Zendaya', 'Crew')).toBe(
      'Titles with Zendaya on the crew',
    );
  });

  it('maps official jobs, not the department name glued on', () => {
    expect(filmographyHeading('Lorne Michaels', 'Executive Producer')).toBe(
      'Titles produced by Lorne Michaels',
    );
    expect(filmographyHeading('Hans Zimmer', 'Original Music Composer')).toBe(
      'Titles with sound by Hans Zimmer',
    );
    expect(filmographyHeading('Roger Deakins', 'Director of Photography')).toBe(
      'Titles shot by Roger Deakins',
    );
  });

  it('does not use an as-department sentence for unknown jobs', () => {
    expect(filmographyHeading('Sam', 'Mystery Job')).toBe(
      'Mystery Job credits for Sam',
    );
    expect(filmographyHeading('Sam', 'Production')).not.toContain(' as ');
  });
});
