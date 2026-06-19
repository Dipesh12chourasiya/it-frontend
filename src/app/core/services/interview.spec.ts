import { TestBed } from '@angular/core/testing';

import { Interview } from './interview';

describe('Interview', () => {
  let service: Interview;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Interview);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
