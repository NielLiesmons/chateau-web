<script>
  /**
   * TaskBox component - displays task status indicator
   * States: backlog, open, closed (done), inProgress, inReview, canceled
   * Matches Flutter: zaplab_design/lib/src/widgets/tasks/task_box.dart
   */
  import { Check, Circle50, Circle75, Cross } from "$lib/components/icons";
  
  export let state = "open"; // "backlog" | "open" | "closed" | "inProgress" | "inReview" | "canceled"
  export let size = 24;

  $: checkStrokeWidth = size >= 20 ? 2.8 : 1.4;
  $: iconSize  = Math.round(size * 0.58);
  $: crossSize = Math.round(size * 0.4);
  // Fixed VB constant → rendered stroke scales proportionally with icon size (~2.1px at size=24, ~1.4px at size=16)
  const crossStrokeWidth = 3.3;
  // Proportional offset matching Flutter's SizedBox(width: 7) at size=24
  $: progressPadding = Math.round(size * 0.25);
</script>

<div
  class="task-box"
  class:state-backlog={state === "backlog"}
  class:state-open={state === "open"}
  class:state-closed={state === "closed"}
  class:state-in-progress={state === "inProgress"}
  class:state-in-review={state === "inReview"}
  class:state-canceled={state === "canceled"}
  style="width: {size}px; height: {size}px; border-radius: {size / 3}px;"
>
  {#if state === "closed"}
    <!-- LabIcon.s8 check with white outline -->
    <Check
      variant="outline"
      color="white"
      strokeWidth={checkStrokeWidth}
      size={size * 0.5}
    />
  {:else if state === "inProgress"}
    <!-- Circle50 offset right like Flutter: SizedBox(width: 7) proportional to size -->
    <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; padding-left:{progressPadding}px;">
      <Circle50 variant="fill" color="hsl(var(--goldColor))" size={iconSize} />
    </div>
  {:else if state === "inReview"}
    <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
      <Circle75 variant="fill" color="hsl(var(--blurpleColor))" size={iconSize} />
    </div>
  {:else if state === "canceled"}
    <Cross variant="outline" color="hsl(var(--destructive))" strokeWidth={crossStrokeWidth} size={crossSize} />
  {/if}
  <!-- Open/backlog states show empty box -->
</div>

<style>
  .task-box {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .state-backlog {
    background-color: transparent;
    border: 1.4px dashed hsl(var(--white33));
  }

  .state-open {
    background-color: hsl(var(--black33));
    border: 1.4px solid hsl(var(--white33));
  }

  .state-closed {
    background: var(--gradient-blurple);
    border: none;
  }

  .state-in-progress {
    background-color: hsl(var(--black33));
    border: 1.4px solid hsl(var(--goldColor66));
  }

  .state-in-review {
    background-color: hsl(var(--black33));
    border: 1.4px solid hsl(var(--blurpleColor66));
  }

  .state-canceled {
    background-color: hsl(344 100% 64% / 0.33);
    border: none;
  }


</style>
