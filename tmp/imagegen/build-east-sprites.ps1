Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$canvasSize = 1254
$block = 3
$scale = 24
$backgroundThreshold = 78
$outDir = Join-Path $PSScriptRoot '..\..\assets\characters\teppou\east'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$jobs = @(
    @{ Source = (Join-Path $PSScriptRoot 'source_walk_01.png'); Output = 'walk_01.png' },
    @{ Source = (Join-Path $PSScriptRoot 'source_walk_02.png'); Output = 'walk_02.png' },
    @{ Source = (Join-Path $PSScriptRoot 'source_kneel_left_01.png'); Output = 'kneel_left_01.png' }
)

function Color-Distance([System.Drawing.Color]$a, [System.Drawing.Color]$b) {
    $dr = [double]$a.R - $b.R
    $dg = [double]$a.G - $b.G
    $db = [double]$a.B - $b.B
    return [Math]::Sqrt($dr * $dr + $dg * $dg + $db * $db)
}

function Get-BackgroundColor([System.Drawing.Bitmap]$bmp) {
    $samples = @(
        $bmp.GetPixel(2, 2), $bmp.GetPixel($bmp.Width - 3, 2),
        $bmp.GetPixel(2, $bmp.Height - 3), $bmp.GetPixel($bmp.Width - 3, $bmp.Height - 3)
    )
    $r = [int](($samples | Measure-Object R -Average).Average)
    $g = [int](($samples | Measure-Object G -Average).Average)
    $b = [int](($samples | Measure-Object B -Average).Average)
    return [System.Drawing.Color]::FromArgb(255, $r, $g, $b)
}

function Map-Color([System.Drawing.Color]$c, [double]$relativeY, [double]$relativeX) {
    $r = [int]$c.R; $g = [int]$c.G; $b = [int]$c.B
    $max = [Math]::Max($r, [Math]::Max($g, $b))
    $min = [Math]::Min($r, [Math]::Min($g, $b))
    $lum = ($r + $g + $b) / 3.0

    if ($lum -lt 48) { return [System.Drawing.Color]::FromArgb(255, 35, 31, 29) }
    if ($max - $min -lt 24 -and $lum -gt 188) { return [System.Drawing.Color]::FromArgb(255, 244, 244, 239) }

    # Original blue clothing: hair/top become near-black; lower hakama becomes pale gray.
    if ($b -gt $r * 1.12 -and $b -gt $g * 1.04) {
        if ($relativeY -gt 0.58) {
            if ($lum -gt 120) { return [System.Drawing.Color]::FromArgb(255, 173, 173, 169) }
            return [System.Drawing.Color]::FromArgb(255, 126, 128, 127)
        }
        if ($lum -gt 105) { return [System.Drawing.Color]::FromArgb(255, 55, 56, 57) }
        return [System.Drawing.Color]::FromArgb(255, 12, 13, 15)
    }

    # Skin and the wooden stock.
    if ($r -gt $b * 1.22 -and $g -gt $b * 1.08) {
        if ($relativeY -gt 0.30 -and $relativeY -lt 0.70 -and $relativeX -gt 0.36) {
            if ($lum -gt 145) { return [System.Drawing.Color]::FromArgb(255, 242, 190, 126) }
            return [System.Drawing.Color]::FromArgb(255, 205, 137, 64)
        }
        return [System.Drawing.Color]::FromArgb(255, 156, 87, 25)
    }

    if ($lum -gt 150) { return [System.Drawing.Color]::FromArgb(255, 230, 229, 219) }
    if ($relativeY -gt 0.56) { return [System.Drawing.Color]::FromArgb(255, 145, 146, 143) }
    if ($lum -gt 82) { return [System.Drawing.Color]::FromArgb(255, 92, 93, 92) }
    return [System.Drawing.Color]::FromArgb(255, 31, 29, 28)
}

foreach ($job in $jobs) {
    $src = [System.Drawing.Bitmap]::FromFile($job.Source)
    try {
        $bg = Get-BackgroundColor $src
        $coreMinX = $src.Width; $coreMinY = $src.Height; $coreMaxX = -1; $coreMaxY = -1
        for ($y = 0; $y -lt $src.Height; $y++) {
            for ($x = 0; $x -lt $src.Width; $x++) {
                $pixel = $src.GetPixel($x, $y)
                $lum = ($pixel.R + $pixel.G + $pixel.B) / 3.0
                if ((Color-Distance $pixel $bg) -gt $backgroundThreshold -and $lum -lt 150) {
                    $coreMinX = [Math]::Min($coreMinX, $x); $coreMaxX = [Math]::Max($coreMaxX, $x)
                    $coreMinY = [Math]::Min($coreMinY, $y); $coreMaxY = [Math]::Max($coreMaxY, $y)
                }
            }
        }
        $allowedMinX = [Math]::Max(0, $coreMinX - 5); $allowedMaxX = [Math]::Min($src.Width - 1, $coreMaxX + 5)
        $allowedMinY = [Math]::Max(0, $coreMinY - 5); $allowedMaxY = [Math]::Min($src.Height - 1, $coreMaxY + 6)
        $minX = $src.Width; $minY = $src.Height; $maxX = -1; $maxY = -1
        for ($y = $allowedMinY; $y -le $allowedMaxY; $y++) {
            for ($x = $allowedMinX; $x -le $allowedMaxX; $x++) {
                if ((Color-Distance $src.GetPixel($x, $y) $bg) -gt $backgroundThreshold) {
                    $minX = [Math]::Min($minX, $x); $maxX = [Math]::Max($maxX, $x)
                    $minY = [Math]::Min($minY, $y); $maxY = [Math]::Max($maxY, $y)
                }
            }
        }
        if ($maxX -lt $minX -or $maxY -lt $minY) { throw "No sprite found in $($job.Source)" }

        $logicalWidth = [int][Math]::Ceiling(($maxX - $minX + 1) / $block)
        $logicalHeight = [int][Math]::Ceiling(($maxY - $minY + 1) / $block)
        $logical = New-Object System.Drawing.Bitmap($logicalWidth, $logicalHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            for ($ly = 0; $ly -lt $logicalHeight; $ly++) {
                for ($lx = 0; $lx -lt $logicalWidth; $lx++) {
                    $best = $null; $bestDistance = 0.0
                    for ($dy = 0; $dy -lt $block; $dy++) {
                        for ($dx = 0; $dx -lt $block; $dx++) {
                            $sx = $minX + $lx * $block + $dx; $sy = $minY + $ly * $block + $dy
                            if ($sx -gt $maxX -or $sy -gt $maxY) { continue }
                            $candidate = $src.GetPixel($sx, $sy)
                            $distance = Color-Distance $candidate $bg
                            if ($distance -gt $bestDistance) { $bestDistance = $distance; $best = $candidate }
                        }
                    }
                    if ($bestDistance -le $backgroundThreshold) {
                        $logical.SetPixel($lx, $ly, [System.Drawing.Color]::Transparent)
                    } else {
                        $logical.SetPixel($lx, $ly, (Map-Color $best ($ly / [Math]::Max(1, $logicalHeight - 1)) ($lx / [Math]::Max(1, $logicalWidth - 1))))
                    }
                }
            }

            $canvas = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            try {
                $graphics = [System.Drawing.Graphics]::FromImage($canvas)
                try {
                    $graphics.Clear([System.Drawing.Color]::Transparent)
                    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
                    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
                    $drawWidth = $logicalWidth * $scale; $drawHeight = $logicalHeight * $scale
                    $drawX = [int](($canvasSize - $drawWidth) / 2)
                    $drawY = [int](($canvasSize - $drawHeight) / 2)
                    $graphics.DrawImage($logical, $drawX, $drawY, $drawWidth, $drawHeight)
                } finally { $graphics.Dispose() }
                $outputPath = Join-Path $outDir $job.Output
                $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
            } finally { $canvas.Dispose() }
        } finally { $logical.Dispose() }
    } finally { $src.Dispose() }
}
