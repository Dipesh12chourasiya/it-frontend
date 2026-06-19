import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InterviewDetail } from './interview-detail';

describe('InterviewDetail', () => {
  let component: InterviewDetail;
  let fixture: ComponentFixture<InterviewDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InterviewDetail],
    }).compileComponents();

    fixture = TestBed.createComponent(InterviewDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
