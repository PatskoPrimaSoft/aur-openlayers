import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-demo-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './demo-header.component.html',
  styleUrl: './demo-header.component.scss',
})
export class DemoHeaderComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) component!: string;
  @Input({ required: true }) description!: string;
  @Input() features: string[] = [];
  @Input() interactions: string[] = [];
}
