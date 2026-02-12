<script>
  import { page } from '$app/stores';
</script>

<div class="min-h-screen flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-bold mb-4">
      {$page.status}
    </h1>
    <p class="text-xl text-muted-foreground">
      {$page.error?.message || 'Something went wrong'}
    </p>
  </div>
</div>
