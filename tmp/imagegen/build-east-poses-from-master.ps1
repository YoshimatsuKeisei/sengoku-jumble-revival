Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$masterPath = Join-Path $PSScriptRoot 'east_fullbody_master.png'
$outDir = Join-Path $PSScriptRoot '..\..\assets\characters\teppou\east'
$outline = [System.Drawing.Color]::FromArgb(255, 55, 53, 52)
$dark = [System.Drawing.Color]::FromArgb(255, 91, 93, 94)
$mid = [System.Drawing.Color]::FromArgb(255, 130, 132, 132)
$light = [System.Drawing.Color]::FromArgb(255, 164, 165, 163)
$shoe = [System.Drawing.Color]::FromArgb(255, 18, 18, 18)
$sock = [System.Drawing.Color]::FromArgb(255, 247, 238, 222)

function Points([object[]]$values) {
    $result = New-Object System.Collections.Generic.List[System.Drawing.Point]
    foreach ($pair in $values) { $result.Add([System.Drawing.Point]::new($pair[0], $pair[1])) }
    return $result.ToArray()
}

function New-Frame([string]$name, [scriptblock]$drawPose) {
    $source = [System.Drawing.Bitmap]::FromFile($masterPath)
    try {
        $frame = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $g = [System.Drawing.Graphics]::FromImage($frame)
            try {
                $g.Clear([System.Drawing.Color]::Transparent)
                $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                $upper = [System.Drawing.Rectangle]::new(0, 0, $source.Width, 839)
                $g.DrawImage($source, $upper, $upper, [System.Drawing.GraphicsUnit]::Pixel)
                $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
                & $drawPose $g
            } finally { $g.Dispose() }
            $frame.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $frame.Dispose() }
    } finally { $source.Dispose() }
}

New-Frame 'walk_01.png' {
    param($g)
    $g.FillRectangle((New-Object Drawing.SolidBrush($outline)), 440, 839, 360, 120)
    $g.FillRectangle((New-Object Drawing.SolidBrush($outline)), 440, 919, 160, 120)
    $g.FillRectangle((New-Object Drawing.SolidBrush($outline)), 640, 919, 160, 80)
    $g.FillRectangle((New-Object Drawing.SolidBrush($mid)), 480, 839, 280, 120)
    $g.FillRectangle((New-Object Drawing.SolidBrush($light)), 480, 839, 80, 80)
    $g.FillRectangle((New-Object Drawing.SolidBrush($mid)), 480, 919, 80, 80)
    $g.FillRectangle((New-Object Drawing.SolidBrush($dark)), 680, 919, 80, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush($sock)), 480, 999, 80, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush($shoe)), 440, 1039, 160, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush($sock)), 680, 959, 80, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush($shoe)), 640, 999, 200, 40)
}

New-Frame 'walk_02.png' {
    param($g)
    $g.FillRectangle((New-Object Drawing.SolidBrush($outline)), 480, 839, 280, 200)
    $g.FillRectangle((New-Object Drawing.SolidBrush($mid)), 520, 839, 200, 160)
    $g.FillRectangle((New-Object Drawing.SolidBrush($light)), 520, 839, 80, 80)
    $g.FillRectangle((New-Object Drawing.SolidBrush($dark)), 640, 879, 80, 120)
    $g.FillRectangle((New-Object Drawing.SolidBrush($sock)), 520, 999, 160, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush($shoe)), 480, 1039, 280, 40)
}

New-Frame 'kneel_left_01.png' {
    param($g)
    $g.FillRectangle((New-Object Drawing.SolidBrush($outline)), 440, 839, 320, 120)
    $g.FillRectangle((New-Object Drawing.SolidBrush($outline)), 400, 919, 200, 120)
    $g.FillRectangle((New-Object Drawing.SolidBrush($outline)), 640, 919, 200, 80)
    $g.FillRectangle((New-Object Drawing.SolidBrush($mid)), 480, 839, 240, 120)
    $g.FillRectangle((New-Object Drawing.SolidBrush($light)), 480, 839, 80, 80)
    $g.FillRectangle((New-Object Drawing.SolidBrush($mid)), 440, 919, 120, 80)
    $g.FillRectangle((New-Object Drawing.SolidBrush($dark)), 680, 919, 120, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush($sock)), 440, 999, 80, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush($shoe)), 400, 1039, 200, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush($sock)), 720, 959, 80, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush($shoe)), 680, 999, 200, 40)
}
