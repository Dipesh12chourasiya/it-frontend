import { TestBed } from '@angular/core/testing';

import { Candidate } from './candidate';

describe('Candidate', () => {
  let service: Candidate;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Candidate);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
