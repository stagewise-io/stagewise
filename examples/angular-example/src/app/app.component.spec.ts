import { TestBed } from '@angular/core/testing';
import { AppComponent2 } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent2],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent2);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'angular-example' title`, () => {
    const fixture = TestBed.createComponent(AppComponent2);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('angular-example');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(AppComponent2);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Hello, angular-example',
    );
  });
});
