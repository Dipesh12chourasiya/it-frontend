import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Join } from './join';

describe('Join', () => {
  let component: Join;
  let fixture: ComponentFixture<Join>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Join],
    }).compileComponents();

    fixture = TestBed.createComponent(Join);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
