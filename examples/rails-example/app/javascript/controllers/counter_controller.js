import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="counter"
export default class extends Controller {
  static targets = [ "count" ]
  
  connect() {
    this.count = 0
  }
  
  increment() {
    this.count++
    this.countTarget.textContent = this.count
  }
}