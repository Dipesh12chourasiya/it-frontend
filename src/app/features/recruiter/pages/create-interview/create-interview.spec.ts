import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateInterview } from './create-interview';

describe('CreateInterview', () => {
  let component: CreateInterview;
  let fixture: ComponentFixture<CreateInterview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateInterview],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateInterview);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
