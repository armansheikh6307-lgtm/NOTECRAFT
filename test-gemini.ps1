$sampleNote = @{
    title = "Product Launch Planning"
    content = "We held the Q4 strategy meeting today. We must finish the API documentation by Friday, and QA testing starts Monday morning. Also need to email the design team for updated logos, and prepare the slide deck for investors. The budget for extra cloud instances has been approved."
}

$actions = @("summarize", "improve-writing", "extract-tasks", "generate-title")

foreach ($action in $actions) {
    Write-Host "================== Testing Action: $action =================="
    $payload = @{
        action = $action
        title = $sampleNote.title
        content = $sampleNote.content
    } | ConvertTo-Json

    try {
        $res = Invoke-RestMethod -Uri "http://localhost:3001/api/ai/assist" -Method Post -Body $payload -ContentType "application/json"
        Write-Host "Success: $($res.success)"
        Write-Host "Model: $($res.model)"
        Write-Host "Result:"
        Write-Host $res.result
    } catch {
        Write-Host "Error for $action : $_"
    }
    Write-Host ""
}
