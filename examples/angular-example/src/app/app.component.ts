import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { ResourcesComponent } from './resources/resources.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, ResourcesComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'angular-example';
}
